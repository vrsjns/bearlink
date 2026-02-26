-- Create databases
CREATE DATABASE auth_service;
CREATE DATABASE url_service;
CREATE DATABASE analytics_service;
CREATE DATABASE link_management;

-- Create roles
CREATE ROLE auth_service_role WITH LOGIN PASSWORD 'auth_service_password';
CREATE ROLE url_service_role WITH LOGIN PASSWORD 'url_service_password';
CREATE ROLE analytics_service_role WITH LOGIN PASSWORD 'analytics_service_password';
CREATE ROLE link_management_role WITH LOGIN PASSWORD 'link_management_password';

-- Grant privileges to roles
GRANT ALL PRIVILEGES ON DATABASE auth_service TO auth_service_role;
GRANT ALL PRIVILEGES ON DATABASE url_service TO url_service_role;
GRANT ALL PRIVILEGES ON DATABASE analytics_service TO analytics_service_role;
GRANT ALL PRIVILEGES ON DATABASE link_management TO link_management_role;

-- Set up permissions on schemas and tables
\connect auth_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO auth_service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO auth_service_role;

\connect url_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO url_service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO url_service_role;

\connect analytics_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO analytics_service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO analytics_service_role;

\connect link_management;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO link_management_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO link_management_role;
