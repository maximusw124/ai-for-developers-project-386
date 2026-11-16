import "@typespec/http";
import "@typespec/openapi";

using Http;

@service(#{ title: "Booking API" })
@server("http://localhost:3000", "Local development")
namespace BookingApi;

model PublicMeetingType {
  id: int32;
  name: string;
  description: string;
  durationMin: int32;
}

@route("/meeting-types")
@get
@TypeSpec.OpenAPI.operationId("listPublicMeetingTypes")
op listPublicMeetingTypes(): {
  @statusCode statusCode: 200;
  @body body: PublicMeetingType[];
};
