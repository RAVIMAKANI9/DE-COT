import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pipelineRouter from "./pipeline";
import evaluationRouter from "./evaluation";
import inferenceRouter from "./inference";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/pipeline", pipelineRouter);
router.use("/evaluation", evaluationRouter);
router.use("/inference", inferenceRouter);

export default router;
