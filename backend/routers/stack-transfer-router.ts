import express, { Express, Router as ExpressRouter } from "express";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { configureHttpDirectTransport, serveDirectHttpArchive } from "../transfers/http-direct-transport";

export class StackTransferRouter extends Router {
    create(_app: Express, server: DockgeServer): ExpressRouter {
        configureHttpDirectTransport(server.config.dataDir);
        const router = express.Router();
        router.get("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
        router.head("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
        return router;
    }
}
