from pydantic import BaseModel, Field, validator, ConfigDict, field_serializer
from datetime import datetime
from typing import Optional, List

class RoomCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=100)
    starts_at: datetime
    expires_at: datetime

    @validator('expires_at')
    def validate_dates(cls, v, values):
        if 'starts_at' in values and v <= values['starts_at']:
            raise ValueError('End time must be after start time')
        return v

class RoomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    code: str
    title: str
    created_at: datetime
    starts_at: datetime
    expires_at: datetime
    is_active: bool
    # organizer_token is NOT returned here for security, only on creation response

    @field_serializer('created_at', 'starts_at', 'expires_at')
    def serialize_dt(self, dt: datetime, _info):
        return dt.isoformat() + 'Z' if dt.tzinfo is None else dt.isoformat()

class RoomCreatedResponse(RoomResponse):
    organizer_token: str
    qr_code: str

class QuestionCreate(BaseModel):
    content: str = Field(..., min_length=3, max_length=500)
    voter_id: str = Field(..., min_length=10) # Client generated UUID

    @validator('content')
    def content_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Question cannot be empty')
        return v

class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    content: str
    created_at: datetime
    votes: int
    is_answered: bool
    organizer_reply: Optional[str] = None

    @field_serializer('created_at')
    def serialize_dt(self, dt: datetime, _info):
        return dt.isoformat() + 'Z' if dt.tzinfo is None else dt.isoformat()

class VoteCreate(BaseModel):
    voter_id: str

class OrganizerReply(BaseModel):
    reply_text: str = Field(..., max_length=500)

class DashboardResponse(BaseModel):
    room: RoomResponse
    questions: List[QuestionResponse]
    qr_code: str
