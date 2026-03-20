import { initializeUsfmMarkerCatalog } from "@/core/domain/usfm/onionMarkers.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

initializeUsfmMarkerCatalog(await webUsfmOnionService.getMarkerCatalog());
