import assert from "node:assert/strict";
import { parsePlaceDetailsResponse } from "./google-places.ts";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const wellFormedPlace = {
  id: "ChIJexample",
  formattedAddress: "1234 Main St, Springfield, IL 62701, USA",
  location: { latitude: 39.7817, longitude: -89.6501 },
  addressComponents: [{ longText: "1234", shortText: "1234", types: ["street_number"] }],
};

runTest("parsePlaceDetailsResponse parses a well-formed place", () => {
  const result = parsePlaceDetailsResponse(wellFormedPlace);

  assert.deepEqual(result, {
    status: "ok",
    formattedAddress: "1234 Main St, Springfield, IL 62701, USA",
    lat: 39.7817,
    lng: -89.6501,
    components: wellFormedPlace.addressComponents,
  });
});

runTest("parsePlaceDetailsResponse tolerates missing addressComponents", () => {
  const result = parsePlaceDetailsResponse({ ...wellFormedPlace, addressComponents: undefined });

  assert.equal(result.status, "ok");
  assert.equal(result.status === "ok" && result.components, undefined);
});

runTest("parsePlaceDetailsResponse treats a missing formattedAddress as not_found", () => {
  assert.deepEqual(parsePlaceDetailsResponse({ ...wellFormedPlace, formattedAddress: undefined }), {
    status: "not_found",
  });
});

runTest("parsePlaceDetailsResponse treats an empty formattedAddress as not_found", () => {
  assert.deepEqual(parsePlaceDetailsResponse({ ...wellFormedPlace, formattedAddress: "  " }), {
    status: "not_found",
  });
});

runTest("parsePlaceDetailsResponse treats a missing location as not_found", () => {
  assert.deepEqual(parsePlaceDetailsResponse({ ...wellFormedPlace, location: undefined }), {
    status: "not_found",
  });

  assert.deepEqual(
    parsePlaceDetailsResponse({ ...wellFormedPlace, location: { latitude: 39.7817 } }),
    { status: "not_found" },
  );
});

runTest("parsePlaceDetailsResponse treats non-object payloads as an error", () => {
  assert.deepEqual(parsePlaceDetailsResponse(null), { status: "error" });
  assert.deepEqual(parsePlaceDetailsResponse("places.googleapis.com is down"), {
    status: "error",
  });
});
