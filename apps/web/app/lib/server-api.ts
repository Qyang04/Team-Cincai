type ApiLoadSuccess<T> = {
  ok: true;
  data: T;
  status: number;
};

type ApiLoadFailure<T> = {
  ok: false;
  data: T;
  message: string;
  status?: number;
};

export type ApiLoadResult<T> = ApiLoadSuccess<T> | ApiLoadFailure<T>;

type FetchApiJsonOptions<T> = {
  url: string;
  init?: RequestInit;
  fallbackData: T;
  resourceLabel: string;
  parse?: (value: unknown) => T;
};

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unexpected request failure.";
}

export async function fetchApiJson<T>({
  url,
  init,
  fallbackData,
  resourceLabel,
  parse,
}: FetchApiJsonOptions<T>): Promise<ApiLoadResult<T>> {
  try {
    const response = await fetch(url, init);

    if (!response.ok) {
      return {
        ok: false,
        data: fallbackData,
        status: response.status,
        message: `${resourceLabel} request failed with ${response.status} ${response.statusText}.`,
      };
    }

    const payload = await response.json();

    return {
      ok: true,
      data: parse ? parse(payload) : (payload as T),
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      data: fallbackData,
      message: `${resourceLabel} could not be reached. ${describeError(error)}`,
    };
  }
}
