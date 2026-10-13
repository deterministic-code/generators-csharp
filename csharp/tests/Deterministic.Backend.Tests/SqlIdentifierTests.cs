using Deterministic.Backend;

namespace Deterministic.Backend.Tests;

public class SqlIdentifierTests
{
    [Theory]
    [InlineData("users")]
    [InlineData("user_accounts")]
    [InlineData("a")]
    [InlineData("a1_b2")]
    public void ValidateIdentifier_AcceptsValidNames(string name)
    {
        SqlIdentifier.ValidateIdentifier(name);
    }

    [Theory]
    [InlineData("Users")]
    [InlineData("1users")]
    [InlineData("bad-name")]
    [InlineData("")]
    [InlineData("user.table")]
    public void ValidateIdentifier_RejectsInvalidNames(string name)
    {
        Assert.Throws<InvalidIdentifierException>(() => SqlIdentifier.ValidateIdentifier(name));
    }

    [Fact]
    public void QuoteIdentifier_UsesDoubleQuotes()
    {
        Assert.Equal("\"users\"", SqlIdentifier.QuoteIdentifier("users"));
    }

    [Fact]
    public void QuoteMysqlIdentifier_UsesBackticks()
    {
        Assert.Equal("`users`", SqlIdentifier.QuoteMysqlIdentifier("users"));
    }

    [Fact]
    public void QuoteSqlServerIdentifier_UsesSquareBrackets()
    {
        Assert.Equal("[users]", SqlIdentifier.QuoteSqlServerIdentifier("users"));
    }

    [Fact]
    public void InvalidIdentifierException_RecordsName()
    {
        var ex = Assert.Throws<InvalidIdentifierException>(
            () => SqlIdentifier.QuoteIdentifier("Bad-Name"));
        Assert.Equal("Bad-Name", ex.Name);
    }
}
