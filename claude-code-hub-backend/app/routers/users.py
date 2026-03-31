import uuid
from fastapi import APIRouter, HTTPException, Depends

from app.database import get_db
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.models import UserCreate, UserLogin, UserUpdate, UserResponse

router = APIRouter()


@router.post("/register")
async def register(data: UserCreate):
    db = await get_db()
    try:
        existing = await db.execute("SELECT id FROM users WHERE username = ?", (data.username,))
        if await existing.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists")

        user_id = str(uuid.uuid4())
        pw_hash = hash_password(data.password)
        display = data.display_name or data.username

        await db.execute(
            "INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)",
            (user_id, data.username, pw_hash, display),
        )
        await db.commit()

        token = create_access_token(user_id, data.username)
        return {"token": token, "user_id": user_id, "username": data.username}
    finally:
        await db.close()


@router.post("/login")
async def login(data: UserLogin):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM users WHERE username = ?", (data.username,))
        user = await cursor.fetchone()
        if not user or not verify_password(data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = create_access_token(user["id"], user["username"])
        return {"token": token, "user_id": user["id"], "username": user["username"]}
    finally:
        await db.close()


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
        user = await cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return UserResponse(
            id=user["id"],
            username=user["username"],
            display_name=user["display_name"],
            base_url=user["base_url"] or "",
            model=user["model"],
            system_prompt=user["system_prompt"],
            work_dir=f"/data/workspaces/{user['id']}",
            has_api_key=bool(user["api_key"]),
            created_at=str(user["created_at"]),
        )
    finally:
        await db.close()


@router.patch("/me")
async def update_me(data: UserUpdate, current_user: dict = Depends(get_current_user)):
    db = await get_db()
    try:
        updates = []
        params = []
        for field, value in data.model_dump(exclude_unset=True).items():
            updates.append(f"{field} = ?")
            params.append(value)

        if not updates:
            return {"ok": True}

        params.append(current_user["id"])
        sql = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        await db.execute(sql, params)
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()
