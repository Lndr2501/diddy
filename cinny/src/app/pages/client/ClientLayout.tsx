import React, { ReactNode } from 'react';
import { Box } from 'folds';
import { TitleBar, useHasCustomTitleBar } from '../../components/titlebar';
import * as titleBarCss from '../../components/titlebar/TitleBar.css';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const hasTitleBar = useHasCustomTitleBar();

  if (!hasTitleBar) {
    return (
      <Box grow="Yes">
        <Box shrink="No">{nav}</Box>
        <Box grow="Yes">{children}</Box>
      </Box>
    );
  }

  return (
    <Box grow="Yes" direction="Column">
      <TitleBar />
      <Box grow="Yes" className={titleBarCss.ClientLayoutContent}>
        <Box shrink="No">{nav}</Box>
        <Box grow="Yes">{children}</Box>
      </Box>
    </Box>
  );
}
