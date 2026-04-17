export interface Identifiable {
  id: number;
}

export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

export interface Auditable extends Identifiable, Timestamped {
  createdBy: string;
  updatedBy: string;
}

export type UserPayload = {
  id: number;
  email: string;
  status: string;
};

export type UserAction = "activate" | "suspend" | "delete";
