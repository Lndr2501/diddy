import React, { ChangeEventHandler, FormEventHandler, useCallback, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Input, Spinner, Text, config } from 'folds';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { isUserId } from '../../../utils/matrix';
import { useIgnoredUsers } from '../../../hooks/useIgnoredUsers';
import { useAlive } from '../../../hooks/useAlive';

function IgnoreUserInput({ userList }: { userList: string[] }) {
  const mx = useMatrixClient();
  const [userId, setUserId] = useState<string>('');
  const alive = useAlive();

  const [ignoreState, ignore] = useAsyncCallback(
    useCallback(
      async (uId: string) => {
        await mx.setIgnoredUsers([...userList, uId]);
      },
      [mx, userList]
    )
  );
  const ignoring = ignoreState.status === AsyncStatus.Loading;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const uId = evt.currentTarget.value;
    setUserId(uId);
  };

  const handleReset = () => {
    setUserId('');
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (ignoring) return;

    const target = evt.target as HTMLFormElement | undefined;
    const userIdInput = target?.userIdInput as HTMLInputElement | undefined;
    const uId = userIdInput?.value.trim();
    if (!uId) return;

    if (!isUserId(uId)) return;

    ignore(uId).then(() => {
      if (alive()) {
        setUserId('');
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} gap="200" aria-disabled={ignoring}>
      <Box grow="Yes" direction="Column">
        <Input
          required
          name="userIdInput"
          placeholder="@user:server"
          value={userId}
          onChange={handleChange}
          variant="Secondary"
          radii="300"
          style={{ paddingRight: config.space.S200 }}
          readOnly={ignoring}
          after={
            userId &&
            !ignoring && (
              <IconButton
                type="reset"
                onClick={handleReset}
                size="300"
                radii="300"
                variant="Secondary"
              >
                <Icon src={Icons.Cross} size="100" />
              </IconButton>
            )
          }
        />
      </Box>
      <Button
        size="400"
        variant="Secondary"
        fill="Soft"
        outlined
        radii="300"
        type="submit"
        disabled={ignoring}
      >
        {ignoring && <Spinner variant="Secondary" size="300" />}
        <Text size="B400">Block</Text>
      </Button>
    </Box>
  );
}

function IgnoredUserRow({ userId, userList }: { userId: string; userList: string[] }) {
  const mx = useMatrixClient();
  const [unignoreState, unignore] = useAsyncCallback(
    useCallback(
      () => mx.setIgnoredUsers(userList.filter((uId) => uId !== userId)),
      [mx, userId, userList]
    )
  );

  const handleUnignore = () => unignore();

  const unIgnoring = unignoreState.status === AsyncStatus.Loading;
  return (
    <InsetRow
      title={userId}
      after={
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          onClick={handleUnignore}
          disabled={unIgnoring}
          before={unIgnoring && <Spinner variant="Secondary" size="100" />}
        >
          <Text size="B300">Unblock</Text>
        </Button>
      }
    />
  );
}

export function IgnoredUserList() {
  const ignoredUsers = useIgnoredUsers();

  return (
    <InsetSection title="Blocked Users">
      <InsetGroup>
        <InsetRow
          title="Block User"
          description="Prevent receiving messages or invites from a user by adding their user ID."
        >
          <IgnoreUserInput userList={ignoredUsers} />
        </InsetRow>
        {ignoredUsers.map((userId) => (
          <IgnoredUserRow key={userId} userId={userId} userList={ignoredUsers} />
        ))}
      </InsetGroup>
    </InsetSection>
  );
}
