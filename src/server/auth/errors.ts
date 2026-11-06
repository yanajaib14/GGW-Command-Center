export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID";

/** Base class for expected, typed errors. Messages are safe to show users. */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export class Unauthenticated extends AppError {
  constructor(message = "You need to sign in.") {
    super("UNAUTHENTICATED", message);
    this.name = "Unauthenticated";
  }
}

export class Forbidden extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super("FORBIDDEN", message);
    this.name = "Forbidden";
  }
}

export class NotFound extends AppError {
  constructor(message = "We could not find that.") {
    super("NOT_FOUND", message);
    this.name = "NotFound";
  }
}

export class Conflict extends AppError {
  constructor(message = "That conflicts with the current state.") {
    super("CONFLICT", message);
    this.name = "Conflict";
  }
}

export class Invalid extends AppError {
  constructor(message = "That input is not valid.") {
    super("INVALID", message);
    this.name = "Invalid";
  }
}
