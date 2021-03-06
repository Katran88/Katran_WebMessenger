const router = require('express').Router();
const login_controller = require('../controllers/login_controller');

router.get('/', login_controller.loginRender);
router.post('/', login_controller.login);
router.get('/logout', login_controller.logout);

module.exports = router;