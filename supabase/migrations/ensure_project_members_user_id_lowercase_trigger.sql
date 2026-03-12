-- Триггер: приводим user_id к lowercase при INSERT/UPDATE в project_members
-- Гарантирует совпадение с user.id из сессии (tg-username всегда lowercase)
CREATE OR REPLACE FUNCTION project_members_lowercase_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id := LOWER(NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_members_lowercase_user_id ON project_members;
CREATE TRIGGER trg_project_members_lowercase_user_id
  BEFORE INSERT OR UPDATE OF user_id ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION project_members_lowercase_user_id();
