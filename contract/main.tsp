import "@typespec/http";
import "@typespec/openapi";

using Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Booking API" })
@server("http://localhost:3000", "Local development")
namespace BookingApi;

model FieldError {
  field: string;
  message: string;
}

model ErrorResponse {
  code: string;
  message: string;
  fieldErrors?: FieldError[];
}

model PublicMeetingType {
  id: int32;
  name: string;
  description: string;
  durationMin: int32;
}

model Owner {
  displayName: string;
}

model UpdateOwnerRequest {
  displayName: string;
}

model Slot {
  start: utcDateTime;
  end: utcDateTime;
}

model DayAvailability {
  date: plainDate;
  slots: Slot[];
}

model Availability {
  meetingType: PublicMeetingType;
  days: DayAvailability[];
}

model AdminMeetingType {
  id: int32;
  name: string;
  description: string;
  durationMin: int32;
  archivedAtMs: int64 | null;
}

model CreateMeetingTypeRequest {
  name: string;
  description?: string;
  durationMin: int32;
}

model UpdateMeetingTypeRequest {
  name: string;
  description?: string;
  durationMin: int32;
}

model CreateBookingRequest {
  meetingTypeId: int32;
  start: utcDateTime;
  guestName: string;
  guestEmail: string;
  comment?: string;
}

model BookingConfirmation {
  meetingType: PublicMeetingType;
  start: utcDateTime;
  end: utcDateTime;
  durationMin: int32;
  ownerName: string;
  guestName: string;
  guestEmail: string;
  comment?: string;
  createdAt: utcDateTime;
}

@route("/meeting-types")
@get
@operationId("listPublicMeetingTypes")
op listPublicMeetingTypes(): {
  @statusCode statusCode: 200;
  @body body: PublicMeetingType[];
};

@route("/meeting-types/{id}")
@get
@operationId("getPublicMeetingType")
op getPublicMeetingType(@path id: int32): {
  @statusCode statusCode: 200;
  @body body: PublicMeetingType;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/meeting-types/{id}/availability")
@get
@operationId("getAvailability")
op getAvailability(@path id: int32): {
  @statusCode statusCode: 200;
  @body body: Availability;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/bookings")
@post
@operationId("createBooking")
op createBooking(@body body: CreateBookingRequest): {
  @statusCode statusCode: 201;
  @body body: BookingConfirmation;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 422;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 409;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 503;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/owner")
@get
@operationId("getOwner")
op getOwner(): {
  @statusCode statusCode: 200;
  @body body: Owner;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/owner")
@patch
@operationId("updateOwner")
op updateOwner(@body body: UpdateOwnerRequest): {
  @statusCode statusCode: 200;
  @body body: Owner;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 422;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/meeting-types")
@get
@operationId("listAdminMeetingTypes")
op listAdminMeetingTypes(): {
  @statusCode statusCode: 200;
  @body body: AdminMeetingType[];
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/meeting-types")
@post
@operationId("createMeetingType")
op createMeetingType(@body body: CreateMeetingTypeRequest): {
  @statusCode statusCode: 201;
  @body body: AdminMeetingType;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 422;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/meeting-types/{id}")
@get
@operationId("getAdminMeetingType")
op getAdminMeetingType(@path id: int32): {
  @statusCode statusCode: 200;
  @body body: AdminMeetingType;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/meeting-types/{id}")
@patch
@operationId("updateMeetingType")
op updateMeetingType(
  @path id: int32,
  @body body: UpdateMeetingTypeRequest,
): {
  @statusCode statusCode: 200;
  @body body: AdminMeetingType;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 422;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/meeting-types/{id}/archive")
@post
@operationId("archiveMeetingType")
op archiveMeetingType(@path id: int32): {
  @statusCode statusCode: 200;
  @body body: AdminMeetingType;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};

@route("/admin/meeting-types/{id}/restore")
@post
@operationId("restoreMeetingType")
op restoreMeetingType(@path id: int32): {
  @statusCode statusCode: 200;
  @body body: AdminMeetingType;
} | {
  @statusCode statusCode: 400;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 404;
  @body body: ErrorResponse;
} | {
  @statusCode statusCode: 500;
  @body body: ErrorResponse;
};
