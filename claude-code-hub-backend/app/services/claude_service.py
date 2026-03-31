"""Claude API integration with streaming and tool execution loop."""

import json
import uuid
from typing import AsyncGenerator, Any

import anthropic

from app.tools.base import get_tool_definitions
from app.tools.executor import execute_tool, execute_tool_streaming


DEFAULT_SYSTEM_PROMPT = """You are Claude Code, an AI assistant that helps users with software engineering tasks.
You have access to tools for reading, writing, and editing files, running bash commands, and searching code.
Use the tools to help the user accomplish their goals. Be concise and action-oriented.
When making file changes, prefer targeted edits over full rewrites.
Always explain what you're doing before executing commands."""


async def stream_chat(
    messages: list[dict],
    api_key: str,
    model: str = "claude-sonnet-4-20250514",
    system_prompt: str = "",
    work_dir: str = "/tmp",
    base_url: str = "",
    max_turns: int = 25,
) -> AsyncGenerator[dict, None]:
    """
    Stream a chat interaction with Claude, handling tool calls in a loop.
    Yields events that the WebSocket can forward to the client.

    Event types:
    - {"type": "text_delta", "content": "..."} — streaming text chunk
    - {"type": "thinking", "content": "..."} — thinking block
    - {"type": "tool_use_start", "tool_name": "...", "tool_id": "...", "input": {...}}
    - {"type": "tool_result", "tool_id": "...", "tool_name": "...", "output": "..."}
    - {"type": "message_complete", "content": "...", "tool_calls": [...], "tool_results": [...]}
    - {"type": "error", "content": "..."}
    - {"type": "done"}
    """
    client_kwargs: dict[str, str] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url
    client = anthropic.AsyncAnthropic(**client_kwargs)
    tools = get_tool_definitions()
    effective_system = system_prompt or DEFAULT_SYSTEM_PROMPT

    # Build API messages from conversation history
    api_messages = _build_api_messages(messages)

    turn = 0
    while turn < max_turns:
        turn += 1

        try:
            collected_text = ""
            collected_tool_calls = []
            collected_thinking = ""
            current_tool_input_json = ""
            current_tool_name = ""
            current_tool_id = ""

            async with client.messages.stream(
                model=model,
                max_tokens=16384,
                system=effective_system,
                messages=api_messages,
                tools=tools,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start":
                        block = event.content_block
                        if block.type == "tool_use":
                            current_tool_name = block.name
                            current_tool_id = block.id
                            current_tool_input_json = ""
                        elif block.type == "thinking":
                            pass  # Will accumulate in deltas

                    elif event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            collected_text += delta.text
                            yield {"type": "text_delta", "content": delta.text}
                        elif delta.type == "thinking_delta":
                            collected_thinking += delta.thinking
                            yield {"type": "thinking", "content": delta.thinking}
                        elif delta.type == "input_json_delta":
                            current_tool_input_json += delta.partial_json

                    elif event.type == "content_block_stop":
                        if current_tool_name and current_tool_id:
                            try:
                                tool_input = json.loads(current_tool_input_json) if current_tool_input_json else {}
                            except json.JSONDecodeError:
                                tool_input = {}

                            collected_tool_calls.append({
                                "id": current_tool_id,
                                "name": current_tool_name,
                                "input": tool_input,
                            })

                            yield {
                                "type": "tool_use_start",
                                "tool_name": current_tool_name,
                                "tool_id": current_tool_id,
                                "input": tool_input,
                            }

                            current_tool_name = ""
                            current_tool_id = ""
                            current_tool_input_json = ""

                # Get the final message for stop_reason
                final_message = await stream.get_final_message()
                stop_reason = final_message.stop_reason

        except anthropic.APIError as e:
            yield {"type": "error", "content": f"API Error: {e.message}"}
            yield {"type": "done"}
            return
        except Exception as e:
            yield {"type": "error", "content": f"Error: {str(e)}"}
            yield {"type": "done"}
            return

        # If there are tool calls, execute them and continue the loop
        if collected_tool_calls and stop_reason == "tool_use":
            # Build the assistant message with all content blocks
            assistant_content = []
            if collected_text:
                assistant_content.append({"type": "text", "text": collected_text})
            for tc in collected_tool_calls:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["input"],
                })

            api_messages.append({"role": "assistant", "content": assistant_content})

            # Execute each tool and collect results (with streaming for bash)
            tool_results_content = []
            tool_results_for_client = []

            for tc in collected_tool_calls:
                result = ""
                async for event in execute_tool_streaming(tc["name"], tc["input"], work_dir):
                    if event["type"] == "output_chunk":
                        # Stream real-time output to client
                        yield {
                            "type": "tool_output",
                            "tool_id": tc["id"],
                            "tool_name": tc["name"],
                            "content": event["content"],
                        }
                    elif event["type"] == "result":
                        result = event["content"]

                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "content": result,
                })

                tool_results_for_client.append({
                    "tool_id": tc["id"],
                    "tool_name": tc["name"],
                    "output": result,
                })

                yield {
                    "type": "tool_result",
                    "tool_id": tc["id"],
                    "tool_name": tc["name"],
                    "output": result,
                }

            api_messages.append({"role": "user", "content": tool_results_content})

            # Continue the loop to get the next response
            continue

        # No tool calls or end_turn — we're done
        yield {
            "type": "message_complete",
            "content": collected_text,
            "thinking": collected_thinking if collected_thinking else None,
            "tool_calls": [
                {"name": tc["name"], "input": tc["input"]}
                for tc in collected_tool_calls
            ] if collected_tool_calls else None,
        }
        yield {"type": "done"}
        return

    # Max turns reached
    yield {"type": "error", "content": "Maximum tool execution turns reached"}
    yield {"type": "done"}


def _build_api_messages(messages: list[dict]) -> list[dict]:
    """Convert stored messages to Anthropic API format."""
    api_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "user":
            api_messages.append({"role": "user", "content": content})
        elif role == "assistant":
            # Reconstruct assistant message with tool calls if present
            blocks = []
            if content:
                blocks.append({"type": "text", "text": content})

            tool_calls_str = msg.get("tool_calls")
            if tool_calls_str:
                try:
                    tool_calls = json.loads(tool_calls_str)
                    for tc in tool_calls:
                        blocks.append({
                            "type": "tool_use",
                            "id": tc.get("id", str(uuid.uuid4())),
                            "name": tc["name"],
                            "input": tc.get("input", {}),
                        })
                except (json.JSONDecodeError, KeyError):
                    pass

            if blocks:
                api_messages.append({"role": "assistant", "content": blocks})

            # Add tool results if present
            tool_results_str = msg.get("tool_results")
            if tool_results_str:
                try:
                    tool_results = json.loads(tool_results_str)
                    result_blocks = []
                    for tr in tool_results:
                        result_blocks.append({
                            "type": "tool_result",
                            "tool_use_id": tr.get("tool_id", str(uuid.uuid4())),
                            "content": tr.get("output", ""),
                        })
                    if result_blocks:
                        api_messages.append({"role": "user", "content": result_blocks})
                except (json.JSONDecodeError, KeyError):
                    pass

    return api_messages
