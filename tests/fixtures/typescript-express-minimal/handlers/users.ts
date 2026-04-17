import { Router } from "express";

export const router = Router();

router.get("/users", async (req, res) => {
  res.json([]);
});

router.post("/users", async (req, res) => {
  res.json({});
});

router.delete("/users/:id", async (req, res) => {
  res.status(204).end();
});
