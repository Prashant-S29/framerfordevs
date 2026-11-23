import { studioContentBrowserLimits, type StudioJsonObject } from "../contracts/content";
import {
  decodeStudioPresentationResponse,
  decodeStudioPublishPresentationResponse,
  type StudioPresentationDto,
  type StudioPublishPresentationResultDto,
} from "../contracts/presentation";
import {
  createStudioContentRequest,
  StudioContentClientError,
  type StudioContentClientOptions,
} from "./index";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function presentationPath(collectionId: string): string {
  if (!uuid.test(collectionId)) {
    throw new StudioContentClientError({
      status: 0,
      code: "STUDIO_REQUEST_INVALID",
      message: "The Studio Content route is invalid.",
      retryable: false,
    });
  }
  return `/api/content/collections/${collectionId}/presentation`;
}

export function createStudioPresentationClient(options: StudioContentClientOptions) {
  const request = createStudioContentRequest(options);
  return {
    get(collectionId: string, signal: AbortSignal): Promise<StudioPresentationDto> {
      return request({
        path: presentationPath(collectionId),
        method: "GET",
        signal,
        decoder: (value, status) => decodeStudioPresentationResponse(value, status, collectionId),
      });
    },
    publish(
      collectionId: string,
      body: StudioJsonObject,
      signal: AbortSignal,
    ): Promise<StudioPublishPresentationResultDto> {
      return request({
        path: `${presentationPath(collectionId)}/publish`,
        method: "POST",
        signal,
        body,
        maximumRequestBytes: studioContentBrowserLimits.presentationRequestBytes,
        decoder: (value, status) =>
          decodeStudioPublishPresentationResponse(value, status, collectionId),
      });
    },
  };
}

export type StudioPresentationClient = ReturnType<typeof createStudioPresentationClient>;
