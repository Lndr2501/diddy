import { MemberPowerTag } from '../../types/matrix/room';

const DEFAULT_TAG: MemberPowerTag = {
  name: 'Founder',
  color: '#5b5fe0',
};

export const useRoomCreatorsTag = (): MemberPowerTag => DEFAULT_TAG;
