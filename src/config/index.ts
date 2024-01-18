require('dotenv').config();

export const CONFIG = {
  appName: 'Beltranus',
  node_env: process.env.NODE_ENV || 'development',
  database:{
    user: process.env.PSQL_USER,
    pass: process.env.PSQL_PASS,
    host: process.env.PSQL_HOST,
    dbName: process.env.PSQL_DB
  },
  fakeyou:{
    credentials:{
      email: process.env.FAKEYOU_EMAIL,
      password: process.env.FAKEYOU_PASS
    },
    model_filter:{
      min_rating : 3.7,
      creators : [
        "vegito1089",
        "salchichontron",
        "rice",
        "imku_honey_bee",
        "skippyskype",
        "forrealuseless",
        "cesccp",
        "johnkaizen",
        "orange2005",
        "maiaa",
        "eduardopetrini",
        "theviper12",
        "vox_populi"
      ]
    }
  },
  google:{
    youtubeApiKey: process.env.YOUTUBE_API_KEY
  }
}
