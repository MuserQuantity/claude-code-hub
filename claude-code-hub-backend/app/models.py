from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str = ""


class UserLogin(BaseModel):
    username: str
    password: str


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    base_url: str
    model: str
    system_prompt: str
    work_dir: str
    has_api_key: bool
    created_at: str


class SessionCreate(BaseModel):
    title: str = "New Chat"


class SessionUpdate(BaseModel):
    title: str


class SessionResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str
    last_message: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    tool_calls: Optional[str] = None
    tool_results: Optional[str] = None
    thinking: Optional[str] = None
    created_at: str


class ChatMessage(BaseModel):
    content: str
    session_id: str
