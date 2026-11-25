-- Set Assessment Version V2 inactive by default until explicitly enabled via Admin Console.
UPDATE assessment_versions SET is_active = 0 WHERE version_code = 'V2';

