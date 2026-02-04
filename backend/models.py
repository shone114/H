from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import utils

class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, default=utils.generate_uuid)
    code = Column(String, unique=True, index=True)
    title = Column(String, nullable=False)
    organizer_token = Column(String, nullable=False)
    created_at = Column(DateTime, default=utils.get_utc_now)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)

    questions = relationship("Question", back_populates="room")

class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=utils.generate_uuid)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=utils.get_utc_now)
    votes = Column(Integer, default=0)
    is_answered = Column(Boolean, default=False)
    organizer_reply = Column(String, nullable=True)

    room = relationship("Room", back_populates="questions")
    vote_records = relationship("Vote", back_populates="question")

class Vote(Base):
    __tablename__ = "votes"

    id = Column(String, primary_key=True, default=utils.generate_uuid)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    voter_id = Column(String, nullable=False) # Simple client-side UUID

    question = relationship("Question", back_populates="vote_records")
