from datetime import datetime
import time
import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import mysql.connector
import os
import json
import logging
import re
from datetime import datetime, timedelta
import ast

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(levelname)s - %(message)s")

app = FastAPI()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

VALID_FIELDS = [
    "temperature", "humidity", "voltage", "current", "luminosity",
    "active_power", "apparent_power", "reactive_power", "power_factor",
    "external_input", "light", "move", "reed_state", "latitude",
    "longitude", "altitude"
]

VALID_AGGREGATES = {
    "average": "AVG", "avg": "AVG", "sum": "SUM",
    "min": "MIN", "max": "MAX", "stddev": "STDDEV"
}


SQL_QUERIES = {
    "devEUI": """
        SELECT DISTINCT devEUI
        FROM device_values
        WHERE user_id = %s
    """,
    "latest_value": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s
        AND created_at = (
            SELECT MAX(created_at)
            FROM device_values dv
            WHERE dv.user_id = device_values.user_id
            AND dv.devEUI = device_values.devEUI
        )
    """,
    "latest_value_specific": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s AND devEUI = %s
        ORDER BY created_at DESC
        LIMIT 1
    """,
    "field_year": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s AND YEAR(created_at) = %s
        ORDER BY created_at DESC
    """,
    "field_month": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s AND created_at BETWEEN %s AND %s

        ORDER BY created_at DESC
    """,
    "field_date": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s AND DATE(created_at) = %s
        ORDER BY created_at DESC
    """,
    "field_date_range": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s AND created_at BETWEEN %s AND %s
        ORDER BY created_at DESC
    """,
    "field_time_range": """
        SELECT devEUI, {field}, created_at
        FROM device_values
        WHERE user_id = %s AND created_at BETWEEN %s AND %s
        ORDER BY created_at DESC
    """,
    "aggregate": """
        SELECT {aggregate}({field}) AS aggregate_value
        FROM device_values
        WHERE user_id = %s
    """,
    "aggregate_date_range": """
        SELECT {aggregate}({field}) AS aggregate_value
        FROM device_values
        WHERE user_id = %s AND created_at BETWEEN %s AND %s
    """
}
MONTHS_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12
}
# def interpret_question(question: str):
#     question = question.lower().strip()
#     logging.info(f"Interpreting user question: {question}")

#     aggregate = None
#     fields = set()
#     query_params = {}
#     today = datetime.today()

#     # Standardize "highest" -> "max", "lowest" -> "min"
#     question = re.sub(r'\bhighest\b', 'max', question)
#     question = re.sub(r'\blowest\b', 'min', question)

#     #  Match aggregate queries (e.g., "average temperature", "max humidity")
#     agg_match = re.search(r'(average|avg|sum|min|max|stddev)\s+([\w\s]+)', question)
#     if agg_match:
#         aggregate = VALID_AGGREGATES.get(agg_match.group(1).lower())
#         extracted_fields = agg_match.group(2).split()
#         for word in extracted_fields:
#             if word in VALID_FIELDS:
#                 fields.add(word)

#     #  Match fields in query if not part of an aggregate query
#     if not aggregate:
#         field_matches = re.findall(r'\b(' + "|".join(VALID_FIELDS) + r')\b', question)
#         fields.update(field_matches)

#     if not fields:
#         logging.warning("No valid fields found in the query.")
#         return None, "Invalid field provided."

#     query_params["fields"] = list(fields)

#     if aggregate:
#         query_params["aggregate"] = aggregate

#     #  Handle "yesterday" or "previous day"
#     if "yesterday" in question or "previous day" in question:
#         yesterday = (today - timedelta(days=1)).strftime("%Y-%m-%d")
#         query_params["date_range"] = (yesterday, yesterday)
#         logging.info(f"Applying filter for yesterday: {yesterday}")

#     #  Handle "last month"
#     elif "last month" in question:
#         first_day_last_month = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
#         last_day_last_month = today.replace(day=1) - timedelta(days=1)
#         start_date = first_day_last_month.strftime("%Y-%m-%d")
#         end_date = last_day_last_month.strftime("%Y-%m-%d")
#         query_params["date_range"] = (start_date, end_date)
#         logging.info(f"Applying last month filter: {start_date} to {end_date}")

#     # Handle "last year"
#     elif "last year" in question:
#         last_year = today.year - 1
#         query_params["date_range"] = (f"{last_year}-01-01", f"{last_year}-12-31")
#         logging.info(f"Applying last year filter: {last_year}")

#     #  Handle "last N days"
#     elif re.search(r'last (\d+) days?', question):
#         days_match = re.search(r'last (\d+) days?', question)
#         num_days = int(days_match.group(1))
#         start_date = (today - timedelta(days=num_days)).strftime("%Y-%m-%d")
#         end_date = today.strftime("%Y-%m-%d")
#         query_params["date_range"] = (start_date, end_date)
#         logging.info(f"Applying last {num_days} days filter: {start_date} to {end_date}")

#     #  Handle explicit year queries like "temperature details of 2024"
#     elif re.search(r'(\d{4})', question):
#         year_match = re.search(r'(\d{4})', question)
#         year = int(year_match.group(1))
#         if 2000 <= year <= today.year + 1:
#             query_params["date_range"] = (f"{year}-01-01", f"{year}-12-31")
#             logging.info(f"Applying year filter: {year}")
#     # Handle specific month queries like "temperature in December 2024"
#     month_year_match = re.search(r'(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?', question)
#     if month_year_match:
#         month = MONTHS_MAP.get(month_year_match.group(1))
#         year = int(month_year_match.group(2)) if month_year_match.group(2) else today.year
#         query_params["date_range"] = (f"{year}-{month:02d}-01", f"{year}-{month:02d}-31")
#         logging.info(f"Applying month filter: {query_params['date_range']}")

#     #  Handle specific date queries (e.g., "temperature on 19th December 2024")
#     date_match = re.search(r'(\d{1,2})\s*(st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?', question)
#     if date_match:
#         day = int(date_match.group(1))
#         month = MONTHS_MAP.get(date_match.group(3))
#         year = int(date_match.group(4)) if date_match.group(4) else today.year
#         try:
#             specific_date = datetime(year, month, day).strftime("%Y-%m-%d")
#             query_params["date_range"] = (specific_date, specific_date)
#             logging.info(f"Applying specific date filter: {specific_date}")
#         except ValueError:
#             logging.warning("Invalid date format detected.")

#     #  Handle custom date range (e.g., "from 10th Jan 2024 to 20th Feb 2024")
#     range_match = re.search(r'from (\d{1,2})\s*(january|february|march|april|may|june|july|august|september|october|november|december) (\d{4}) to (\d{1,2})\s*(january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})', question)
#     if range_match:
#         start_day, start_month, start_year = int(range_match.group(1)), MONTHS_MAP.get(range_match.group(2)), int(range_match.group(3))
#         end_day, end_month, end_year = int(range_match.group(4)), MONTHS_MAP.get(range_match.group(5)), int(range_match.group(6))
#         try:
#             start_date = datetime(start_year, start_month, start_day).strftime("%Y-%m-%d")
#             end_date = datetime(end_year, end_month, end_day).strftime("%Y-%m-%d")
#             query_params["date_range"] = (start_date, end_date)
#             logging.info(f"Applying custom date range filter: {start_date} to {end_date}")
#         except ValueError:
#             logging.warning("Invalid date range format detected.")

#     return query_params, None


def get_db_connection():
    """
    Establishes a connection to a MySQL database using credentials from
    environment variables. Returns the connection object if successful,
    otherwise logs an error and returns None.
    """
    try:
        conn = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_DATABASE")
        )
        logging.info("Database connection established successfully.")
        return conn
    except mysql.connector.Error as e:
        logging.error(f"Database connection error: {e}")
        return None


TODAY = datetime(2025, 3, 5)
LAST_YEAR = ["2024-01-01", "2024-12-31"]
THIS_YEAR = ["2025-01-01", "2025-12-31"]
LAST_MONTH = ["2025-02-01", "2025-02-28"]
LAST_30_DAYS = [(TODAY - timedelta(days=30)).strftime("%Y-%m-%d"),
                TODAY.strftime("%Y-%m-%d")]
YESTERDAY = [(TODAY - timedelta(days=1)).strftime("%Y-%m-%d")]


def get_registered_devices(user_id):
    """
    Retrieves a user's registered device IDs from the database.

    Parameters:
        user_id (int or str): User identifier.

    Returns:
        tuple: (list of device IDs or None, error message or None).
    """
    logging.info(f"Fetching registered devices for user {user_id}")

    conn = get_db_connection()
    if conn is None:
        return None, "Database connection failed."

    cursor = conn.cursor(dictionary=True)

    try:
        query = """
            SELECT DISTINCT devEUI
            FROM device_values
            WHERE user_id = %s
        """
        cursor.execute(query, (user_id,))
        data = cursor.fetchall()

        if not data:
            return None, "No registered devices found for this user."

        device_ids = [row["devEUI"] for row in data]
        return device_ids, None

    except mysql.connector.Error as e:
        logging.error(f"Database query error: {e}")
        return None, f"Database query error: {e}"

    finally:
        cursor.close()
        conn.close()


def interpret_question_with_ai(question: str):
    """
    Extracts relevant keywords, fields, aggregation, and date range from a user query
    using an AI model. Maps date-related terms to fixed ranges and returns structured
    JSON data.

    Parameters:
        question (str): User's natural language query.

    Returns:
        tuple: (Extracted query parameters as JSON or None, error message or None).
    """
    logging.info(f"Processing user question: {question}")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "mistralai/mixtral-8x7b-instruct",
        "messages": [
            {
                "role": "user",
                "content": (
                    "Extract relevant keywords from the following question. "
                    "Use these **fixed** date mappings:\n"
                    "- 'this year' → 2025-01-01 to 2025-12-31\n"
                    "- 'last year' → 2024-01-01 to 2024-12-31\n"
                    "- 'last month' → 2025-02-01 to 2025-02-28\n"
                    "- 'last 30 days' → 2025-02-04 to 2025-03-05\n"
                    "- 'yesterday' → 2025-03-04\n\n"
                    "If no date is specified, return:\n"
                    "- 'date_range': ['2000-01-01', '2025-03-07'] (fetch all available data)\n\n"
                    "Identify **only** the following:\n"
                    "- 'fields': List of relevant data fields (e.g., ['temperature', 'humidity'])\n"
                    "- 'aggregate': The aggregation function (MAX, AVG, SUM, etc.), if applicable\n"
                    "- 'date_range': The start and end date of the query (use default if none found)\n\n"
                    " **Do NOT generate SQL queries!** Only extract keywords and return JSON.\n\n"
                    f"User: '{question}'"
                )
            }
        ],
        "max_tokens": 500,
        "temperature": 0.3
    }

    try:
        response = requests.post(
            OPENROUTER_API_URL, headers=headers, json=payload)
        response_data = response.json()

        if response.status_code == 200:
            structured_params = response_data.get("choices", [{}])[0].get(
                "message", {}).get("content", "").strip()

            if structured_params:
                logging.info(f"AI extracted parameters: {structured_params}")

                try:
                    structured_params_json = json.loads(structured_params)

                    if isinstance(structured_params_json.get("aggregate"), dict):
                        structured_params_json["aggregate"] = list(
                            structured_params_json["aggregate"].values())[0]

                    if "date_range" not in structured_params_json or structured_params_json["date_range"] is None:
                        logging.info(
                            "No date range detected, fetching all available data.")
                        structured_params_json["date_range"] = [
                            "2000-01-01", datetime.today().strftime("%Y-%m-%d")]

                    return structured_params_json, None

                except json.JSONDecodeError:
                    logging.error("Error decoding AI JSON.")
                    return None, "AI returned an invalid JSON format."

            else:
                logging.warning("AI did not return extracted keywords.")
                return None, "AI response is empty."

        logging.error(f"AI error: {response_data}")
        return None, "AI keyword extraction failed."

    except Exception as e:
        logging.error(f"Error querying AI: {e}")
        return None, "AI request error."


def fetch_data(user_id, query_params):
    """
    Retrieves device data for a user based on specified fields, aggregation,
    and date range. Supports both raw and aggregated queries.

    Parameters:
        user_id (int or str): User identifier.
        query_params (dict): Query parameters including 'fields', 'aggregate', and 'date_range'.

    Returns:
        tuple: (List of retrieved data or None, error message or None).
    """
    logging.info(
        f"Fetching data for user_id: {user_id} with query parameters: {query_params}")

    conn = get_db_connection()
    if conn is None:
        logging.error("Failed to establish a database connection.")
        return None, "Database connection failed."

    cursor = conn.cursor(dictionary=True)

    try:
        fields = query_params.get("fields", [])
        aggregate = query_params.get("aggregate")
        date_range = query_params.get("date_range", [])

        if len(date_range) == 2 and date_range[0] == date_range[1]:
            start_date = f"{date_range[0]} 00:00:00"
            end_date = f"{date_range[1]} 23:59:59"
        else:
            start_date = f"{date_range[0]} 00:00:00"
            end_date = f"{date_range[1]} 23:59:59"

        date_range = [start_date, end_date]

        if aggregate:
            logging.info(
                f"Executing aggregate query for {fields} using {aggregate}")

            aggregate_fields = ", ".join(
                [f"{aggregate}({field}) AS {field}" for field in fields])
            query = f"""
                SELECT {aggregate_fields}, MAX(created_at) AS created_at
                FROM device_values
                WHERE created_at BETWEEN %s AND %s
            """
            params = [date_range[0], date_range[1]]

        else:
            logging.info(f"Executing non-aggregate query for {fields}")
            field_query = ", ".join(fields)
            query = f"""
                SELECT devEUI, {field_query}, created_at
                FROM device_values
                WHERE created_at BETWEEN %s AND %s
                ORDER BY created_at DESC
                LIMIT 1000;
            """
            params = [date_range[0], date_range[1]]

        logging.info(f"Executing SQL: {query} with params {params}")
        cursor.execute(query, tuple(params))
        data = cursor.fetchall()

        if not data:
            return None, "No data found for the requested query."

        for row in data:
            for key, value in row.items():
                if isinstance(value, datetime):
                    row[key] = value.isoformat()

        return data, None

    except mysql.connector.Error as e:
        logging.error(f"Database query error: {e}")
        return None, f"Database query error: {e}"

    finally:
        cursor.close()
        conn.close()


def analyze_sql_data_with_mistral(data, question, query_params):
    """
    Analyzes SQL query results and formats a response based on the user's question
    and query parameters. Supports both aggregated and raw data summaries.

    Parameters:
        data (list[dict]): Retrieved SQL data.
        question (str): User's query.
        query_params (dict): Query parameters including 'fields' and 'aggregate'.

    Returns:
        str: Formatted analysis of the retrieved data.
    """
    logging.info(
        f"Analyzing SQL data for question: {question} with query_params: {query_params}")

    if not data or len(data) == 0:
        logging.info("No data found for the query.")
        return "No data available for the requested period."

    aggregate_func = query_params.get("aggregate")
    fields = query_params["fields"]

    if aggregate_func:
        response_text = f"The {aggregate_func.lower()} values for the requested time period:\n"
        for field in fields:
            response_text += f" - {field}: {data[0][field]:.2f}\n"

        response_text += f"Recorded at {data[0]['created_at']}."
        return response_text

    device_data = {row["devEUI"]: {field: row[field]
        for field in fields} for row in data}
    formatted_data = "\n".join(
        [f"Device {dev}: {values}" for dev, values in device_data.items()]
    )

    return formatted_data if formatted_data else "No valid response generated from the data."


def ask_mistral(question: str, retries=2):
    """
    Sends a query to the OpenRouter AI model and returns the response.
    Retries on failure for improved reliability.

    Parameters:
        question (str): User's input query.
        retries (int, optional): Number of retry attempts in case of failure (default: 2).

    Returns:
        str: AI-generated response or an error message.
    """
    logging.info(f"Querying OpenRouter AI for: {question}")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "mistralai/mixtral-8x7b-instruct",
        "messages": [{"role": "user", "content": question}],
        "max_tokens": 500,
        "temperature": 0.7
    }

    for attempt in range(retries):
        try:
            response = requests.post(
                OPENROUTER_API_URL, headers=headers, json=payload)
            response_data = response.json()
            logging.info(f"OpenRouter AI Response: {response_data}")

            if response.status_code == 200:
                ai_text = (
                    response_data.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )

                if not ai_text:
                    logging.warning("AI did not return a valid response.")
                    return "I analyzed the retrieved data, but I couldn't generate insights at this moment. Please review the data below."

                return ai_text

            else:
                logging.error(f"OpenRouter API error: {response_data}")

                if response.status_code in [502, 503, 504] and attempt < retries - 1:
                    logging.info("Retrying AI request...")
                    time.sleep(2)
                    continue

                return "AI response failed."

        except Exception as e:
            logging.error(f"Error calling OpenRouter API: {e}")
            return "AI request error."

    return "AI request failed after multiple attempts."


def get_latest_values(user_id, fields):
    """
    Retrieves the latest values of specified fields for all devices registered to a user.

    Parameters:
        user_id (int or str): User identifier.
        fields (list[str]): List of data fields to fetch.

    Returns:
        tuple: (List of latest values or None, error message or None).
    """
    logging.info(f"Fetching latest {fields} values for all devices of user {user_id}")

    conn = get_db_connection()
    if conn is None:
        return None, "Database connection failed."

    cursor = conn.cursor(dictionary=True)

    try:
        field_query = ", ".join(fields)

        query = f"""
            SELECT devEUI, {field_query}, created_at
            FROM device_values
            WHERE user_id = %s
            AND created_at = (
                SELECT MAX(created_at)
                FROM device_values dv
                WHERE dv.user_id = device_values.user_id
                AND dv.devEUI = device_values.devEUI
            )
        """
        cursor.execute(query, (user_id,))
        data = cursor.fetchall()

        if not data:
            return None, f"No recent {', '.join(fields)} data available for any registered device."

        # Convert datetime fields to string format
        for row in data:
            row["created_at"] = row["created_at"].isoformat()

        return data, None

    except mysql.connector.Error as e:
        logging.error(f"Database query error: {e}")
        return None, f"Database query error: {e}"

    finally:
        cursor.close()
        conn.close()


async def handle_latest_values_request(websocket: WebSocket, user_id: int, field="temperature"):
    """
    Handles a WebSocket request to fetch the latest values of a specified field for all devices.

    Parameters:
        websocket (WebSocket): WebSocket connection.
        user_id (int): User identifier.
        field (str, optional): Field to fetch (default: "temperature").

    Returns:
        None: Sends a JSON response over WebSocket.
    """
    data, error = get_latest_values(user_id, field)

    if error:
        response = {"message": error}
    else:
        response = {
            "message": f"Here are the latest {field} values for all registered devices:",
            "data": data
        }

    await websocket.send_text(json.dumps(response, indent=4))


def get_latest_values_for_device(user_id, devEUI, fields):
    """
    Retrieves the latest values of specified fields for a particular device.

    Parameters:
        user_id (int or str): User identifier.
        devEUI (str): Device unique identifier.
        fields (list[str]): List of data fields to fetch.

    Returns:
        tuple: (List of latest values or None, error message or None).
    """
    logging.info(
        f"Fetching latest {', '.join(fields)} values for device {devEUI} under user {user_id}")

    conn = get_db_connection()
    if conn is None:
        return None, "Database connection failed."

    cursor = conn.cursor(dictionary=True)

    try:
        field_query = ", ".join(fields)  # construct query for multiple fields
        query = f"""
            SELECT devEUI, {field_query}, created_at
            FROM device_values
            WHERE user_id = %s AND devEUI = %s
            ORDER BY created_at DESC
            LIMIT 1
        """
        cursor.execute(query, (user_id, devEUI))
        data = cursor.fetchall()

        if not data:
            return None, f"No recent {', '.join(fields)} data available for device {devEUI}."
        for row in data:
            row["created_at"] = row["created_at"].isoformat()

        return data, None

    except mysql.connector.Error as e:
        logging.error(f"Database query error: {e}")
        return None, f"Database query error: {e}"

    finally:
        cursor.close()
        conn.close()


@app.websocket("/ws/ask/{user_id}")
async def websocket_ask(websocket: WebSocket, user_id: int):
    """
    Handles real-time user queries via WebSocket, processing natural language
    questions to fetch registered devices, latest values, or structured data
    from the database.

    Parameters:
        websocket (WebSocket): WebSocket connection instance.
        user_id (int): User identifier.

    Returns:
        None: Sends responses over WebSocket based on user queries.
    """
    await websocket.accept()
    logging.info(f"WebSocket connection established for user {user_id}")

    try:
        while True:
            question = await websocket.receive_text()
            logging.info(f"Received question from user {user_id}: {question}")

            if any(keyword in question.lower() for keyword in ["registered devices", "device ids", "my devices"]):
                logging.info(f"Fetching registered devices for user {user_id}")
                devices, error = get_registered_devices(user_id)

                if error:
                    response = {"message": error}
                else:
                    response = {
                        "message": "Here are the registered devices for your user ID:",
                        "devices": devices
                    }

                await websocket.send_text(json.dumps(response, indent=4))
                continue

            field_matches = re.findall(
                r'latest\s+([\w\s]+)|current\s+([\w\s]+)', question, re.IGNORECASE)
            device_match = re.search(
                r'device\s+["\']?([\w\d]+)["\']?', question, re.IGNORECASE)

            if field_matches:
                fields = set()
                for match in field_matches:
                    field = match[0] or match[1]
                    words = field.split()
                    for word in words:
                        if word in VALID_FIELDS:
                            fields.add(word)

                fields = list(fields)

                if not fields:
                    await websocket.send_text(json.dumps(
                        {"message": "No valid fields found in your query. Please specify a valid field."}, indent=4))
                    continue

                if device_match:
                    devEUI = device_match.group(1)
                    logging.info(
                        f"Fetching latest {', '.join(fields)} for device {devEUI} under user {user_id}")
                    data, error = get_latest_values_for_device(
                        user_id, devEUI, fields)

                    if error:
                        response = {"message": error}
                    else:
                        response = {
                            "message": f"Here are the latest {', '.join(fields)} values for device {devEUI}:",
                            "data": data
                        }

                else:
                    logging.info(
                        f"Fetching latest {', '.join(fields)} values for all devices under user {user_id}")
                    data, error = get_latest_values(user_id, fields)

                    if error:
                        response = {"message": error}
                    else:
                        response = {
                            "message": f"Here are the latest {', '.join(fields)} values for all registered devices:",
                            "data": data
                        }

                await websocket.send_text(json.dumps(response, indent=4))
                continue

            query_params, error = interpret_question_with_ai(question)

            if query_params is None:
                logging.info(
                    f"No structured query found for user {user_id}, forwarding to AI for interpretation.")
                ai_response = ask_mistral(question)
                await websocket.send_text(json.dumps({"message": ai_response}, indent=4))
                continue

            logging.info(
                f"Structured query found for user {user_id}, proceeding with data fetch.")

            data, error = fetch_data(user_id, query_params)

            if not data:
                logging.info(
                    f"No data found for user {user_id} with query parameters {query_params}, generating custom AI response."
                )
                ai_response = analyze_sql_data_with_mistral(
                    data, question, query_params)
                await websocket.send_text(json.dumps({"message": ai_response}, indent=4))
            else:
                logging.info(
                    f"Data found for user {user_id} with query parameters {query_params}. Generating AI response.")

                ai_response = analyze_sql_data_with_mistral(
                    data, question, query_params)

                response_payload = {
                    "ai_response": ai_response,
                    "data": data
                }
                await websocket.send_text(json.dumps(response_payload, indent=4))

    except WebSocketDisconnect:
        logging.info(f"WebSocket connection closed for user {user_id}")
    except Exception as e:
        logging.error(f"Unexpected WebSocket error for user {user_id}: {e}")
