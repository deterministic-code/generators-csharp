namespace Deterministic.Backend;

public sealed class InvalidIdentifierException : Exception
{
    public InvalidIdentifierException(string name)
        : base($"invalid SQL identifier: {name}")
    {
        Name = name;
    }

    public InvalidIdentifierException() : base("invalid SQL identifier") { }

    public InvalidIdentifierException(string message, Exception innerException)
        : base(message, innerException) { }

    public string Name { get; } = string.Empty;
}
