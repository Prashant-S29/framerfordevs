import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { toast } from "sonner";

import { createQueryClient } from "./index";

const toastError = vi.mocked(toast.error);

afterEach(() => {
  toastError.mockClear();
});

describe("query error feedback", () => {
  it("reports ordinary query failures globally", async () => {
    const queryClient = createQueryClient();

    await expect(
      queryClient.fetchQuery({
        queryKey: ["ordinary-failure"],
        queryFn: () => Promise.reject(new Error("Request failed.")),
      }),
    ).rejects.toThrow("Request failed.");

    expect(toastError).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledWith("Error: Request failed.", expect.any(Object));
  });

  it("allows a component-owned empty state to suppress the global error toast", async () => {
    const queryClient = createQueryClient();

    await expect(
      queryClient.fetchQuery({
        queryKey: ["expected-empty-state"],
        queryFn: () => Promise.reject(new Error("The requested resource was not found.")),
        meta: { suppressGlobalErrorToast: true },
      }),
    ).rejects.toThrow("The requested resource was not found.");

    expect(toastError).not.toHaveBeenCalled();
  });
});
