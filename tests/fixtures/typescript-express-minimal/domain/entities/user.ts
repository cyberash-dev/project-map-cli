import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

export enum UserStatus {
  Active = "active",
  Suspended = "suspended",
  Deleted = "deleted",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  email!: string;

  @Column({ type: "enum", enum: UserStatus })
  status!: UserStatus;

  activate(): void {
    this.status = UserStatus.Active;
  }

  suspend(): void {
    this.status = UserStatus.Suspended;
  }
}
