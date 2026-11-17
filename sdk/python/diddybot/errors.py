"""Errors a command can end with. Catch them all in ``@bot.on_command_error`` or one command's
``@my_command.error``; without a handler the bot answers with a short, friendly note.

::

    CommandError
    ├── UsageError            wrong arguments: answered with the usage line
    │   ├── MissingArgument
    │   └── BadArgument       a converter said no ("abc" is no number, no such member ...)
    ├── CheckFailure          a check said no
    │   ├── MissingPower      power level too low
    │   ├── NotOwner          only the bot owners (``Bot(owners=[...])``)
    │   ├── DMOnly / RoomOnly
    │   └── OnCooldown        ``.retry_after`` seconds
    └── CommandInvokeError    the command itself crashed, ``.original`` is the exception
"""
from __future__ import annotations

__all__ = ["CommandError", "UsageError", "MissingArgument", "BadArgument", "CheckFailure",
           "MissingPower", "NotOwner", "DMOnly", "RoomOnly", "OnCooldown", "CommandInvokeError"]


class CommandError(Exception):
    """Base of every error a command can end with. Raise it with a text to answer that text."""


class UsageError(CommandError):
    """Wrong arguments. Raise it in a command to answer with the usage line plus your message."""


class MissingArgument(UsageError):
    def __init__(self, param: str):
        self.param = param
        super().__init__(f"missing {param.replace('_', ' ')}")


class BadArgument(UsageError):
    """A converter could not turn the text into the wanted type."""


class CheckFailure(CommandError):
    """A check (``@checks.power``, ``@checks.check`` ...) did not allow the command."""


class MissingPower(CheckFailure):
    def __init__(self, needed: int, has: int, command: str = ""):
        self.needed, self.has = needed, has
        super().__init__(f"{command} needs power level {needed} in this room (you have {has})."
                         .strip())


class NotOwner(CheckFailure):
    def __init__(self, command: str = ""):
        super().__init__(f"{command} is only for the owners of this bot.".strip())


class DMOnly(CheckFailure):
    def __init__(self, command: str = ""):
        super().__init__(f"{command} only works in a direct message with me.".strip())


class RoomOnly(CheckFailure):
    def __init__(self, command: str = ""):
        super().__init__(f"{command} does not work in a direct message.".strip())


class OnCooldown(CheckFailure):
    def __init__(self, retry_after: float, command: str = ""):
        self.retry_after = retry_after
        wait = max(1, round(retry_after))
        super().__init__(f"Slow down: {command} works again in {wait} s.".replace("  ", " "))


class CommandInvokeError(CommandError):
    """The command raised something else; ``original`` is that exception."""

    def __init__(self, original: BaseException):
        self.original = original
        super().__init__(f"{type(original).__name__}: {original}")
