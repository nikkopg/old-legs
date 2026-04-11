# READY FOR QA
# Feature: Auth router stub (TASK-001 scaffold, TASK-003 for full implementation)
# What was built: Router stub with placeholder endpoints
# Edge cases to test: None yet — real auth comes in TASK-003

from fastapi import APIRouter

router = APIRouter()


# TODO TASK-003: Implement Strava OAuth flow
# POST /auth/strava — initiate OAuth
# GET  /auth/strava/callback — handle callback, store tokens
