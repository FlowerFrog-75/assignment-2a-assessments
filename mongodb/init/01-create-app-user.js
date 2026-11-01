// Creates the least-privilege database user the Next.js app connects with.
//
// Docker: the official image runs this automatically (as root) the first
// time the container starts with an empty data volume.
//
// Native install (no Docker): run it yourself as the admin user, e.g.
//   MONGO_APP_DB=digital_skills_wallet MONGO_APP_USERNAME=dsw_app MONGO_APP_PASSWORD=... \
//     mongosh "mongodb://dsw_admin@127.0.0.1:27017/admin" mongodb/init/01-create-app-user.js

const appDbName = process.env.MONGO_APP_DB || "digital_skills_wallet";
const appUser = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appUser || !appPassword) {
  throw new Error("MONGO_APP_USERNAME and MONGO_APP_PASSWORD must be set");
}

const appDb = db.getSiblingDB(appDbName);

if (appDb.getUser(appUser)) {
  print(`[init] User "${appUser}" already exists on "${appDbName}", skipping.`);
} else {
  appDb.createUser({
    user: appUser,
    pwd: appPassword,
    // readWrite covers CRUD plus creating and dropping indexes and collections
    // in this one database. The app cannot touch any other database or
    // manage users.
    roles: [{ role: "readWrite", db: appDbName }],
  });
  print(`[init] Created user "${appUser}" with readWrite on "${appDbName}".`);
}
