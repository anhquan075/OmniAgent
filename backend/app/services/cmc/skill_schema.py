from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SkillValidationResult:
    valid: bool
    missing: list[str]

    @property
    def reason(self) -> str | None:
        if self.valid:
            return None
        return f"Missing required CMC Skill Hub parameter(s): {', '.join(self.missing)}"


class CmcSkillSchemaValidator:
    @staticmethod
    def validate(params: dict[str, object], schema: dict[str, Any] | None) -> SkillValidationResult:
        if not schema:
            return SkillValidationResult(True, [])
        required = schema.get("required")
        if not isinstance(required, list):
            return SkillValidationResult(True, [])
        missing = [
            str(name)
            for name in required
            if isinstance(name, str) and name not in params
        ]
        return SkillValidationResult(not missing, missing)
