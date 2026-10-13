# Deterministic.Backend (C#)

Shared backend types and SQL identifier helpers for generated C# apps.
Persistence lives in Datasources-generated repositories, not this library.

## Layout

- `src/Deterministic.Backend/` - library project
- `tests/Deterministic.Backend.Tests/` - xUnit tests

## Build & test

```bash
cd csharp
dotnet restore
dotnet build
dotnet test
dotnet format --verify-no-changes
```
