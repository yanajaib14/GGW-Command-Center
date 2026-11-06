// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/server/auth/client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: (a: unknown) => sendVerificationOtp(a) },
    signIn: { emailOtp: (a: unknown) => signInEmailOtp(a) },
  },
}));

import { SignInForm } from "@/app/(public)/sign-in/sign-in-form";

beforeEach(() => {
  replace.mockReset();
  sendVerificationOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  signInEmailOtp.mockReset().mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

async function submitEmail(value = " Som@X.com ") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Code");
}

describe("SignInForm", () => {
  it("sends a code to the trimmed lower-cased email", async () => {
    render(<SignInForm />);
    await submitEmail();
    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "som@x.com",
      type: "sign-in",
    });
    expect(screen.getByText("Enter the code we sent to som@x.com.")).toBeTruthy();
  });

  it("shows the error message when sending fails", async () => {
    sendVerificationOtp.mockResolvedValue({ data: null, error: { message: "Too many tries" } });
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many tries");
  });

  it("falls back to a generic message when the provider gives none", async () => {
    sendVerificationOtp.mockResolvedValue({ data: null, error: {} });
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong. Try again.");
  });

  it("submits the code and redirects to /", async () => {
    render(<SignInForm />);
    await submitEmail("a@b.com");
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(signInEmailOtp).toHaveBeenCalledWith({ email: "a@b.com", otp: "123456" });
  });

  it("redirects to a safe redirectTo", async () => {
    render(<SignInForm redirectTo="/hub" />);
    await submitEmail("a@b.com");
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/hub"));
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", ""])(
    "rejects an unsafe redirectTo %j",
    async (bad) => {
      render(<SignInForm redirectTo={bad} />);
      await submitEmail("a@b.com");
      fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    },
  );

  it("shows the error and stays when the code is wrong", async () => {
    signInEmailOtp.mockResolvedValue({ data: null, error: { message: "Invalid code" } });
    render(<SignInForm />);
    await submitEmail("a@b.com");
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid code");
    expect(replace).not.toHaveBeenCalled();
  });

  it("submit button shows loading while pending", async () => {
    sendVerificationOtp.mockReturnValue(new Promise(() => {}));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send code" }).getAttribute("aria-busy")).toBe("true"),
    );
  });

  it("can go back to a different email and resend a code", async () => {
    render(<SignInForm />);
    await submitEmail("a@b.com");
    fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(sendVerificationOtp).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});
