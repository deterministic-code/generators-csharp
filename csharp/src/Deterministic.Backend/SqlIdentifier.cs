using System.Text.RegularExpressions;

namespace Deterministic.Backend;

public static class SqlIdentifier
{
    private static readonly Regex ValidIdentifierRegex =
        new("^[a-z][a-z0-9_]*$", RegexOptions.Compiled);

    public static void ValidateIdentifier(string name)
    {
        if (name is null || !ValidIdentifierRegex.IsMatch(name))
        {
            throw new InvalidIdentifierException(name ?? string.Empty);
        }
    }

    public static string QuoteIdentifier(string name)
    {
        ValidateIdentifier(name);
        return $"\"{name}\"";
    }

    public static string QuoteMysqlIdentifier(string name)
    {
        ValidateIdentifier(name);
        return $"`{name}`";
    }

    public static string QuoteSqlServerIdentifier(string name)
    {
        ValidateIdentifier(name);
        return $"[{name}]";
    }
}
