import uuid
from datetime import datetime
import qrcode
from io import BytesIO
import base64

def generate_uuid() -> str:
    return str(uuid.uuid4())

def generate_room_code() -> str:
    """Generates a 6-character alphanumeric room code."""
    return str(uuid.uuid4())[:6].upper()

def generate_organizer_token() -> str:
    """Generates a secure token for organizer access."""
    return str(uuid.uuid4())

def get_utc_now() -> datetime:
    return datetime.utcnow()

def generate_qr_code_base64(data: str) -> str:
    """Generates a QR code and returns it as a base64 encoded string."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return img_str

def get_frontend_url() -> str:
    """Helper to get the frontend URL from CORS_ORIGINS for emails/QR codes."""
    import os
    cors_origins = os.getenv("CORS_ORIGINS", "").split(",")
    # Return the first origin that is not localhost if available, or just the first one.
    # Logic: In prod, CORS_ORIGINS="https://myapp.vercel.app". In dev, "http://localhost:5173".
    if cors_origins and cors_origins[0]:
        return cors_origins[0].strip()
    return "http://localhost:5173"
