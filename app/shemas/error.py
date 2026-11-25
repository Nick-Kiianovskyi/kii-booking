from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str = Field(
        ..., description="Stable machine-readable error code, e.g. BUSINESS_NOT_FOUND"
    )
    message: str = Field(..., description="Human-readable error message")
    details: list[dict] | None = Field(
        default=None, description="Optional structured details (validation errors)"
    )


class ErrorResponse(BaseModel):
    """Uniform error envelope returned by every API error."""

    detail: str = Field(..., description="Legacy alias for error.message")
    error: ErrorBody
    path: str = Field(..., description="Request path that produced the error")
