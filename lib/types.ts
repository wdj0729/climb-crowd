export type Source = 'somoim' | 'daangn';

export interface RawGroup {
  source: Source;
  externalId: string;
  name: string;
  url: string;
}

export interface RawMeetup {
  source: Source;
  externalId: string;
  groupExternalId: string;
  title: string;
  startsAt: Date;
  participants: number;
  capacity: number | null;
  placeText: string | null;
  placeLat: number | null;
  placeLon: number | null;
  url: string;
}

/** Sent from the API to the browser as JSON. */
export interface WeekMeetup {
  id: string;
  source: Source;
  gymId: string;
  title: string;
  groupName: string;
  startsAt: string;
  participants: number;
  capacity: number | null;
  url: string;
}

export interface WeekResponse {
  days: string[];
  lastScrapeAt: string | null;
  meetups: WeekMeetup[];
}
