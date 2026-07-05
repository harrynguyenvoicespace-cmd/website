export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    email: string;
    name: string;
  };
  expiresIn: number;
}

export interface ContactRequest {
  email: string;
  message: string;
}

export interface ApiError {
  ok: false;
  message: string;
}
