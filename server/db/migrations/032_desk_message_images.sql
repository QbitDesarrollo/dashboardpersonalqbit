-- Add image support to desk messages
ALTER TABLE desk_messages ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER mensaje;
