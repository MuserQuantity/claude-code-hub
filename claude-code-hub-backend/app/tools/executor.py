"""Tool execution engine — sandboxed per-user tool execution."""

import asyncio
import glob as glob_module
import os
import json
from pathlib import Path
from typing import Any


MAX_OUTPUT_CHARS = 50000
BASH_TIMEOUT = 30


def _resolve_path(work_dir: str, path: str) -> str:
    """Resolve a path relative to the user's working directory, with security checks."""
    if os.path.isabs(path):
        resolved = os.path.realpath(path)
    else:
        resolved = os.path.realpath(os.path.join(work_dir, path))

    work_dir_real = os.path.realpath(work_dir)
    if not resolved.startswith(work_dir_real):
        raise PermissionError(f"Access denied: path '{path}' is outside the working directory")
    return resolved


async def execute_tool(tool_name: str, tool_input: dict[str, Any], work_dir: str) -> str:
    """Execute a tool and return the result as a string."""
    os.makedirs(work_dir, exist_ok=True)

    try:
        if tool_name == "bash":
            return await _exec_bash(tool_input, work_dir)
        elif tool_name == "file_read":
            return await _exec_file_read(tool_input, work_dir)
        elif tool_name == "file_write":
            return await _exec_file_write(tool_input, work_dir)
        elif tool_name == "file_edit":
            return await _exec_file_edit(tool_input, work_dir)
        elif tool_name == "glob":
            return await _exec_glob(tool_input, work_dir)
        elif tool_name == "grep":
            return await _exec_grep(tool_input, work_dir)
        else:
            return f"Unknown tool: {tool_name}"
    except PermissionError as e:
        return f"Permission denied: {e}"
    except Exception as e:
        return f"Error: {type(e).__name__}: {e}"


async def _exec_bash(tool_input: dict, work_dir: str) -> str:
    command = tool_input.get("command", "")
    if not command:
        return "Error: no command provided"

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=work_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "HOME": work_dir},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=BASH_TIMEOUT)

        result_parts = []
        if stdout:
            out = stdout.decode("utf-8", errors="replace")
            if len(out) > MAX_OUTPUT_CHARS:
                out = out[:MAX_OUTPUT_CHARS] + "\n... (output truncated)"
            result_parts.append(out)
        if stderr:
            err = stderr.decode("utf-8", errors="replace")
            if len(err) > MAX_OUTPUT_CHARS:
                err = err[:MAX_OUTPUT_CHARS] + "\n... (output truncated)"
            result_parts.append(f"STDERR:\n{err}")

        exit_info = f"Exit code: {proc.returncode}"
        result_parts.append(exit_info)

        return "\n".join(result_parts) if result_parts else "Command completed (no output)"
    except asyncio.TimeoutError:
        return f"Error: command timed out after {BASH_TIMEOUT}s"


async def _exec_file_read(tool_input: dict, work_dir: str) -> str:
    path = _resolve_path(work_dir, tool_input["path"])
    if not os.path.exists(path):
        return f"Error: file not found: {tool_input['path']}"
    if not os.path.isfile(path):
        return f"Error: not a file: {tool_input['path']}"

    with open(path, "r", errors="replace") as f:
        lines = f.readlines()

    offset = tool_input.get("offset", 0)
    limit = tool_input.get("limit")
    if limit:
        lines = lines[offset : offset + limit]
    elif offset:
        lines = lines[offset:]

    numbered = [f"{i + offset + 1:6d} | {line}" for i, line in enumerate(lines)]
    content = "".join(numbered)
    if len(content) > MAX_OUTPUT_CHARS:
        content = content[:MAX_OUTPUT_CHARS] + "\n... (content truncated)"
    return content if content else "(empty file)"


async def _exec_file_write(tool_input: dict, work_dir: str) -> str:
    path = _resolve_path(work_dir, tool_input["path"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(tool_input["content"])
    return f"Successfully wrote to {tool_input['path']}"


async def _exec_file_edit(tool_input: dict, work_dir: str) -> str:
    path = _resolve_path(work_dir, tool_input["path"])
    if not os.path.exists(path):
        return f"Error: file not found: {tool_input['path']}"

    with open(path, "r") as f:
        content = f.read()

    old_string = tool_input["old_string"]
    new_string = tool_input["new_string"]

    count = content.count(old_string)
    if count == 0:
        return f"Error: old_string not found in {tool_input['path']}"
    if count > 1:
        return f"Error: old_string found {count} times in {tool_input['path']} — must be unique"

    content = content.replace(old_string, new_string, 1)
    with open(path, "w") as f:
        f.write(content)

    return f"Successfully edited {tool_input['path']}"


async def _exec_glob(tool_input: dict, work_dir: str) -> str:
    pattern = tool_input["pattern"]
    full_pattern = os.path.join(work_dir, pattern)
    matches = sorted(glob_module.glob(full_pattern, recursive=True))

    # Make paths relative to work_dir
    rel_matches = [os.path.relpath(m, work_dir) for m in matches]

    if not rel_matches:
        return "No files matched the pattern."

    if len(rel_matches) > 500:
        rel_matches = rel_matches[:500]
        return "\n".join(rel_matches) + f"\n... ({len(matches)} total, showing first 500)"

    return "\n".join(rel_matches)


async def _exec_grep(tool_input: dict, work_dir: str) -> str:
    pattern = tool_input["pattern"]
    search_path = tool_input.get("path", ".")
    include = tool_input.get("include", "")

    resolved_path = _resolve_path(work_dir, search_path)

    cmd_parts = ["rg", "--no-heading", "--line-number", "--max-count", "50"]
    if include:
        cmd_parts.extend(["--glob", include])
    cmd_parts.extend(["--", pattern, resolved_path])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_parts,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=work_dir,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        output = stdout.decode("utf-8", errors="replace")
        if not output:
            return "No matches found."
        # Make paths relative
        output = output.replace(work_dir + "/", "")
        if len(output) > MAX_OUTPUT_CHARS:
            output = output[:MAX_OUTPUT_CHARS] + "\n... (output truncated)"
        return output
    except FileNotFoundError:
        # rg not installed, fall back to grep
        cmd_parts = ["grep", "-rn", "--max-count=50"]
        if include:
            cmd_parts.extend(["--include", include])
        cmd_parts.extend(["--", pattern, resolved_path])
        proc = await asyncio.create_subprocess_exec(
            *cmd_parts,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=work_dir,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        output = stdout.decode("utf-8", errors="replace")
        return output if output else "No matches found."
    except asyncio.TimeoutError:
        return "Error: search timed out"
