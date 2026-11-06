"""Public portfolio read (projected) and admin-only create/update with optimistic locking."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import ConfigDict, Field, BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.auth import admin_only
from backend.content.api import draft_version
from backend.content.store import timestamp
from backend.database import get_db
from backend.models import Profile, User
from backend.profile.schema import ProfileDocument, public_view

router = APIRouter(prefix="/api", tags=["profile"])


class ProfileUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: ProfileDocument
    is_public: bool = Field(default=False, alias="isPublic")
    source_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")] | None = Field(default=None, alias="sourceSha256")
    ai_model: Annotated[str, Field(min_length=1, max_length=128)] | None = Field(default=None, alias="aiModel")


def admin_body(row: Profile):
    return {"profileId": row.id, "version": row.version, "isPublic": row.is_public, "document": row.entities,
            "sourceSha256": row.source_sha256, "aiModel": row.ai_model, "updatedAt": row.updated_at}


@router.get("/profile")
def public_profile(db: Session = Depends(get_db)):
    """No authentication: the portfolio is the public landing page. Returns only the public projection."""
    row = db.scalar(select(Profile).where(Profile.is_public.is_(True)).order_by(Profile.created_at).limit(1))
    if row is None:
        raise HTTPException(404, "No public profile")
    return {"profileId": row.id, "version": row.version, "updatedAt": row.updated_at,
            "profile": public_view(row.entities)}


@router.get("/studio/profile", dependencies=[Depends(admin_only)])
def read_profile(response: Response, db: Session = Depends(get_db)):
    row = db.scalar(select(Profile).order_by(Profile.created_at).limit(1))
    if row is None:
        raise HTTPException(404, "No profile yet")
    response.headers["ETag"] = f'"{row.version}"'
    return admin_body(row)


@router.post("/studio/profile", status_code=201)
def create_profile(body: ProfileUpsert, response: Response, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.scalar(select(Profile.id).limit(1)) is not None:
        raise HTTPException(409, "A profile already exists; update it with If-Match")
    now = timestamp()
    row = Profile(id=f"prf-{uuid.uuid4().hex[:16]}", entities=body.document.stored(), is_public=body.is_public,
                  version=1, source_sha256=body.source_sha256, ai_model=body.ai_model,
                  created_at=now, updated_at=now, updated_by=user.id)
    db.add(row)
    db.commit()
    response.headers["ETag"] = '"1"'
    return admin_body(row)


@router.put("/studio/profile")
def update_profile(body: ProfileUpsert, response: Response, user: User = Depends(admin_only),
                   db: Session = Depends(get_db), if_match: Annotated[str | None, Header()] = None):
    version = draft_version(if_match)
    # One conditional UPDATE is the compare-and-swap: a stale writer changes nothing.
    changed = db.execute(update(Profile).where(Profile.version == version).values(
        entities=body.document.stored(), is_public=body.is_public, version=Profile.version + 1,
        source_sha256=body.source_sha256, ai_model=body.ai_model, updated_at=timestamp(), updated_by=user.id,
    ).execution_options(synchronize_session=False)).rowcount
    db.commit()
    row = db.scalar(select(Profile).order_by(Profile.created_at).limit(1))
    if row is None:
        raise HTTPException(404, "No profile yet")
    if not changed:
        raise HTTPException(409, "Profile version conflict; reload the profile")
    response.headers["ETag"] = f'"{row.version}"'
    return admin_body(row)
