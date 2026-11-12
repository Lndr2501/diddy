import React, { useRef } from 'react';
import { Scroll } from 'folds';

import {
  Sidebar,
  SidebarContent,
  SidebarStackSeparator,
  SidebarStack,
} from '../../components/sidebar';
import {
  HomeTab,
  SpaceTabs,
  InboxTab,
  ExploreTab,
  UnverifiedTab,
  SearchTab,
  PluginsTab,
} from './sidebar';
import { CreateTab } from './sidebar/CreateTab';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

export function SidebarNav() {
  const screenSize = useScreenSizeContext();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <Sidebar>
      <SidebarContent
        scrollable={
          <Scroll ref={scrollRef} variant="Background" size="0">
            <SidebarStack>
              <HomeTab />
              <InboxTab />
            </SidebarStack>
            <SpaceTabs scrollRef={scrollRef} />
            <SidebarStackSeparator />
            <SidebarStack>
              <ExploreTab />
              <CreateTab />
            </SidebarStack>
          </Scroll>
        }
        sticky={
          <>
            <SidebarStackSeparator />
            <SidebarStack>
              <PluginsTab />
              {/* on larger screens the search field in the header does the same */}
              {screenSize === ScreenSize.Mobile && <SearchTab />}
              <UnverifiedTab />
            </SidebarStack>
          </>
        }
      />
    </Sidebar>
  );
}
