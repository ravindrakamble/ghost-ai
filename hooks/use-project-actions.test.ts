// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { pushMock, refreshMock, paramsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  paramsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  useParams: paramsMock,
}));

import { useProjectActions } from "./use-project-actions";

const project = { id: "p1", name: "Checkout Service" };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  paramsMock.mockReturnValue({});
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

describe("useProjectActions", () => {
  describe("create", () => {
    it("does nothing when the name is empty", async () => {
      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openCreateDialog());

      await act(async () => {
        await result.current.submitCreate();
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts the trimmed name and navigates to the server-returned project id", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, { project: { id: "new-id", name: "Checkout Service" } })
      );

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openCreateDialog());
      act(() => result.current.setName("  Checkout Service  "));

      await act(async () => {
        await result.current.submitCreate();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Checkout Service" }),
        })
      );
      expect(pushMock).toHaveBeenCalledWith("/editor/new-id");
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(result.current.dialogType).toBeNull();
    });

    it("sets an error and keeps the dialog open when the request fails", async () => {
      fetchMock.mockResolvedValue(jsonResponse(false, { error: "Nope" }));

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openCreateDialog());
      act(() => result.current.setName("Checkout Service"));

      await act(async () => {
        await result.current.submitCreate();
      });

      expect(pushMock).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Nope");
      expect(result.current.dialogType).toBe("create");
    });
  });

  describe("rename", () => {
    it("patches the target project and refreshes on success", async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, { project }));

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openRenameDialog(project));
      act(() => result.current.setName("New Name"));

      await act(async () => {
        await result.current.submitRename();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/p1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "New Name" }),
        })
      );
      expect(refreshMock).toHaveBeenCalled();
      expect(result.current.dialogType).toBeNull();
    });

    it("sets an error and keeps the dialog open when the request fails", async () => {
      fetchMock.mockResolvedValue(jsonResponse(false, { error: "Forbidden" }));

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openRenameDialog(project));
      act(() => result.current.setName("New Name"));

      await act(async () => {
        await result.current.submitRename();
      });

      expect(refreshMock).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Forbidden");
      expect(result.current.dialogType).toBe("rename");
    });
  });

  describe("delete", () => {
    it("deletes and refreshes in place when the project is not the active workspace", async () => {
      paramsMock.mockReturnValue({});
      fetchMock.mockResolvedValue(jsonResponse(true, { success: true }));

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openDeleteDialog(project));

      await act(async () => {
        await result.current.submitDelete();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/p1",
        expect.objectContaining({ method: "DELETE" })
      );
      expect(refreshMock).toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();
      expect(result.current.dialogType).toBeNull();
    });

    it("redirects to /editor and still refreshes when deleting the active workspace", async () => {
      paramsMock.mockReturnValue({ roomId: "p1" });
      fetchMock.mockResolvedValue(jsonResponse(true, { success: true }));

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openDeleteDialog(project));

      await act(async () => {
        await result.current.submitDelete();
      });

      expect(pushMock).toHaveBeenCalledWith("/editor");
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("sets an error and keeps the dialog open when the request fails", async () => {
      paramsMock.mockReturnValue({});
      fetchMock.mockResolvedValue(jsonResponse(false, { error: "Forbidden" }));

      const { result } = renderHook(() => useProjectActions());
      act(() => result.current.openDeleteDialog(project));

      await act(async () => {
        await result.current.submitDelete();
      });

      expect(result.current.error).toBe("Forbidden");
      expect(result.current.dialogType).toBe("delete");
      expect(pushMock).not.toHaveBeenCalled();
      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  it("derives a cosmetic room-id preview from the slug and a short suffix", () => {
    const { result } = renderHook(() => useProjectActions());
    act(() => result.current.openCreateDialog());
    act(() => result.current.setName("Checkout Service"));

    expect(result.current.roomIdPreview).toMatch(/^checkout-service-[a-z0-9]{6}$/);
  });
});
