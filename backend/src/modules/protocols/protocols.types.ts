/** Domain types for module 2.2 (protocols) — see `tasks/06-protocols.md`. */
export type ProtocolCategory = 'transport' | 'device_protocol';

export interface Protocol {
  id: string;
  name: string;
  category: ProtocolCategory;
  image: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ListProtocolsQuery {
  search: string | undefined;
  category: ProtocolCategory | undefined;
  page: number;
  perPage: number;
}

export interface CreateProtocolInput {
  name: string;
}

export interface UpdateProtocolInput {
  name: string | undefined;
}
