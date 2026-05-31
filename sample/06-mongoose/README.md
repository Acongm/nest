### Mongoose sample

### Installation


`npm install`

### Running

This example requires docker or a local mongodb installation.  If using a local mongodb, see `app.module.ts` for connection options, and make sure there are matching options for the mongodb installation and the source code.

#### Docker

There is a `docker-compose.yml` file for starting Docker.

`docker-compose up`

After running the sample, you can stop the Docker container with

`docker-compose down`

### Run the sample

Then, run Nest as usual:

`npm run start`



`docker-compose -f docker-compose.dev.yml down`
`docker-compose -f docker-compose.dev.yml up -d`
`docker-compose -f docker-compose.dev.yml logs app`

```shell
# 单独启动 mongoDB 
docker-compose up -d mongodb

# 查看应用日志
docker-compose -f docker-compose.dev.yml logs -f app

# 查看所有服务日志
docker-compose -f docker-compose.dev.yml logs -f
```