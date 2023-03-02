export interface InputMessage {
  _data: Data;
  id: Id2;
  ack: number;
  hasMedia: boolean;
  body: string;
  type: string;
  timestamp: number;
  from: string;
  to: string;
  deviceType: string;
  isForwarded: boolean;
  forwardingScore: number;
  isStatus: boolean;
  isStarred: boolean;
  broadcast: boolean;
  fromMe: boolean;
  hasQuotedMsg: boolean;
  vCards: any[];
  mentionedIds: any[];
  isGif: boolean;
  isEphemeral: boolean;
  links: any[];
}

export interface Id {
  fromMe: boolean;
  remote: string;
  id: string;
  _serialized: string;
}

export interface Data {
  id: Id;
  body: string;
  type: string;
  t: number;
  notifyName: string;
  from: string;
  to: string;
  self: string;
  ack: number;
  isNewMsg: boolean;
  star: boolean;
  kicNotified: boolean;
  recvFresh: boolean;
  isFromTemplate: boolean;
  pollInvalidated: boolean;
  isSentCagPollCreation: boolean;
  latestEditMsgKey?: any;
  latestEditSenderTimestampMs?: any;
  broadcast: boolean;
  mentionedJidList: any[];
  groupMentions: any[];
  isVcardOverMmsDocument: boolean;
  isForwarded: boolean;
  hasReaction: boolean;
  productHeaderImageRejected: boolean;
  lastPlaybackProgress: number;
  isDynamicReplyButtonsMsg: boolean;
  isMdHistoryMsg: boolean;
  stickerSentTs: number;
  isAvatar: boolean;
  requiresDirectConnection: boolean;
  isEphemeral: boolean;
  isStatusV3: boolean;
  links: any[];
}

export interface Id2 {
  fromMe: boolean;
  remote: string;
  id: string;
  _serialized: string;
}