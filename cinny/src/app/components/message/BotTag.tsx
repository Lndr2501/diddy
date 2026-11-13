import React from 'react';
import * as css from './BotTag.css';

/** "BOT" next to the name of a user that announced itself as a bot (dev.diddy.bot / commands). */
export function BotTag() {
  return (
    <span className={css.BotTag} title="This account is a bot">
      Bot
    </span>
  );
}
