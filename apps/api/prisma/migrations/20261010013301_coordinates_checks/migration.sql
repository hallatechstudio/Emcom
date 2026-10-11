-- Coordinates must be valid WGS84 and recorded as a pair.
ALTER TABLE emergencies
  ADD CONSTRAINT emergencies_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT emergencies_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT emergencies_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT emergencies_accuracy_range CHECK ("locationAccuracyM" IS NULL OR "locationAccuracyM" >= 0);
