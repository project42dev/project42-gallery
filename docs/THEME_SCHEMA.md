# Project 42 Theme JSON Schema

Every theme must define a `theme.json` matching this schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Project42Theme",
  "type": "object",
  "required": ["id", "name", "tagline", "version", "tokens"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "name": { "type": "string" },
    "tagline": { "type": "string" },
    "description": { "type": "string" },
    "author": { "type": "string" },
    "version": { "type": "string" },
    "font": { "type": "string" },
    "tokens": {
      "type": "object",
      "required": ["--p42-bg", "--p42-primary", "--p42-surface-card", "--p42-text-title"],
      "additionalProperties": { "type": "string" }
    },
    "subbrands": {
      "type": "object",
      "properties": {
        "learn": { "type": "string" },
        "guide": { "type": "string" }
      }
    }
  }
}
```
