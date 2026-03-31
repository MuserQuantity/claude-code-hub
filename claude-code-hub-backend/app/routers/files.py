"""File management router — upload, download, and list files in user workspace."""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.auth import get_current_user

router = APIRouter()

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB


def _get_workspace(user_id: str) -> str:
    workspace = f"/data/workspaces/{user_id}"
    os.makedirs(workspace, exist_ok=True)
    return workspace


def _resolve_safe_path(workspace: str, relative_path: str) -> str:
    """Resolve and validate a path is within the workspace."""
    if os.path.isabs(relative_path):
        resolved = os.path.realpath(relative_path)
    else:
        resolved = os.path.realpath(os.path.join(workspace, relative_path))
    workspace_real = os.path.realpath(workspace)
    if resolved != workspace_real and not resolved.startswith(workspace_real + os.sep):
        raise HTTPException(status_code=403, detail="Access denied: path outside workspace")
    return resolved


@router.get("/list")
async def list_files(
    path: str = "",
    current_user: dict = Depends(get_current_user),
):
    """List files and directories in the user's workspace."""
    workspace = _get_workspace(current_user["id"])
    target = _resolve_safe_path(workspace, path) if path else workspace

    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="Path not found")
    if not os.path.isdir(target):
        raise HTTPException(status_code=400, detail="Path is not a directory")

    entries = []
    try:
        for entry in sorted(os.listdir(target)):
            full_path = os.path.join(target, entry)
            rel_path = os.path.relpath(full_path, workspace)
            is_dir = os.path.isdir(full_path)
            size = 0 if is_dir else os.path.getsize(full_path)
            entries.append({
                "name": entry,
                "path": rel_path,
                "is_dir": is_dir,
                "size": size,
            })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {"path": os.path.relpath(target, workspace) if target != workspace else ".", "entries": entries}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Upload a file to the user's workspace."""
    workspace = _get_workspace(current_user["id"])
    target_dir = _resolve_safe_path(workspace, path) if path else workspace

    os.makedirs(target_dir, exist_ok=True)

    filename = file.filename or f"upload_{uuid.uuid4().hex[:8]}"
    # Sanitize filename
    filename = os.path.basename(filename)
    target_path = os.path.join(target_dir, filename)

    # Check size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_SIZE // 1024 // 1024}MB)")

    with open(target_path, "wb") as f:
        f.write(content)

    rel_path = os.path.relpath(target_path, workspace)
    return {"filename": filename, "path": rel_path, "size": len(content)}


@router.get("/download")
async def download_file(
    path: str,
    token: str = "",
):
    """Download a file from the user's workspace. Accepts token as query param for browser downloads."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    from app.auth import decode_token
    payload = decode_token(token)
    user_id = payload["sub"]
    workspace = _get_workspace(user_id)
    target = _resolve_safe_path(workspace, path)

    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.isfile(target):
        raise HTTPException(status_code=400, detail="Path is not a file")

    return FileResponse(
        target,
        filename=os.path.basename(target),
        media_type="application/octet-stream",
    )
