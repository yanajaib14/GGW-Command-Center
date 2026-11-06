// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  ListRow,
  PageHeader,
  Select,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";

afterEach(cleanup);

describe("cn", () => {
  it("joins truthy classes and drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("Button", () => {
  it("renders at least the touch-target height class", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "min-h-touch",
    );
  });

  it("defaults to type=button", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("with loading is disabled and aria-busy", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});

describe("Field", () => {
  it("links label, hint and error to the control", () => {
    render(
      <Field label="Email" hint="Work address" error="Required">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.tagName).toBe("INPUT");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const hint = screen.getByText("Work address");
    const error = screen.getByText("Required");
    expect(describedBy).toContain(hint.id);
    expect(describedBy).toContain(error.id);
    expect(error).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("works with Select and omits aria-invalid without an error", () => {
    render(
      <Field label="Role">
        <Select>
          <option>Owner</option>
        </Select>
      </Field>,
    );
    const select = screen.getByLabelText("Role");
    expect(select.tagName).toBe("SELECT");
    expect(select).not.toHaveAttribute("aria-invalid");
  });
});

describe("Badge", () => {
  it("tone sets data-tone", () => {
    render(<Badge tone="danger">Late</Badge>);
    expect(screen.getByText("Late")).toHaveAttribute("data-tone", "danger");
  });
});

describe("EmptyState", () => {
  it("shows title and action", () => {
    render(
      <EmptyState
        title="No staff yet"
        body="Invite your first person."
        action={<Button>Invite</Button>}
      />,
    );
    expect(screen.getByText("No staff yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
  });
});

describe("PageHeader and Card", () => {
  it("PageHeader title is an h1, Card title an h2", () => {
    render(
      <>
        <PageHeader title="Staff" subtitle="All people" actions={<span>x</span>} />
        <Card title="Details">body</Card>
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Staff" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Details" })).toBeInTheDocument();
  });
});

describe("ListRow", () => {
  it("renders a link when href is given", () => {
    render(<ListRow title="Ana" subtitle="Cook" trailing="Active" href="/owner/staff/1" />);
    expect(screen.getByRole("link", { name: /Ana/ })).toHaveAttribute("href", "/owner/staff/1");
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders a plain row without href", () => {
    render(<ListRow title="Ben" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Ben")).toBeInTheDocument();
  });
});

describe("Banner", () => {
  it("uses role=status for info and warning, role=alert for danger", () => {
    render(
      <>
        <Banner tone="info">Heads up</Banner>
        <Banner tone="warning">Careful</Banner>
        <Banner tone="danger">Broken</Banner>
      </>,
    );
    expect(screen.getByText("Heads up")).toHaveAttribute("role", "status");
    expect(screen.getByText("Careful")).toHaveAttribute("role", "status");
    expect(screen.getByText("Broken")).toHaveAttribute("role", "alert");
  });
});

describe("Dialog", () => {
  it("opens with showModal, is labelled by its title, and closes via onClose", () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    });
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
    const onClose = vi.fn();

    const { rerender } = render(
      <Dialog open={false} onClose={onClose} title="Confirm">
        Are you sure?
      </Dialog>,
    );
    expect(showModal).not.toHaveBeenCalled();

    rerender(
      <Dialog open onClose={onClose} title="Confirm">
        Are you sure?
      </Dialog>,
    );
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Confirm" })).toBeInTheDocument();

    fireEvent(screen.getByRole("dialog", { name: "Confirm" }), new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Dialog open={false} onClose={onClose} title="Confirm">
        Are you sure?
      </Dialog>,
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("Toast", () => {
  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast.show("Saved", "success")}>go</button>;
  }

  it("shows messages in a polite live region", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    const message = screen.getByText("Saved");
    expect(message.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });
});
