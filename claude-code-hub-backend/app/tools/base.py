"""Base tool definitions inspired by Claude Code's tool architecture."""

import json
from typing import Any

# Tool definitions for the Anthropic API
TOOL_DEFINITIONS = [
    {
        "name": "bash",
        "description": "Execute a bash command in the user's working directory. Use this for running scripts, installing packages, git operations, etc. Commands run in a sandboxed environment scoped to the user's workspace.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute",
                }
            },
            "required": ["command"],
        },
    },
    {
        "name": "file_read",
        "description": "Read the contents of a file. The path must be relative to the user's working directory or an absolute path within it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to read (relative to working directory)",
                },
                "offset": {
                    "type": "integer",
                    "description": "Line number to start reading from (0-indexed). Optional.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of lines to read. Optional.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "file_write",
        "description": "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. The path must be relative to the user's working directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to write (relative to working directory)",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "file_edit",
        "description": "Make a targeted edit to a file by replacing an exact string match with new content. Use this for surgical edits instead of rewriting entire files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to edit (relative to working directory)",
                },
                "old_string": {
                    "type": "string",
                    "description": "The exact string to find and replace (must be unique in the file)",
                },
                "new_string": {
                    "type": "string",
                    "description": "The replacement string",
                },
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
    {
        "name": "glob",
        "description": "Find files matching a glob pattern in the working directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern (e.g. '**/*.py', 'src/**/*.ts')",
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "grep",
        "description": "Search file contents using a regex pattern (powered by ripgrep).",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern to search for",
                },
                "path": {
                    "type": "string",
                    "description": "Directory or file to search in (relative to working directory). Defaults to '.'",
                },
                "include": {
                    "type": "string",
                    "description": "Glob pattern to filter files (e.g. '*.py'). Optional.",
                },
            },
            "required": ["pattern"],
        },
    },
]


def get_tool_definitions() -> list[dict[str, Any]]:
    """Return all tool definitions for the Anthropic API."""
    return TOOL_DEFINITIONS
