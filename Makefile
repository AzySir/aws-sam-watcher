local:
	sam build --cached --parallel
	sam local start-api
